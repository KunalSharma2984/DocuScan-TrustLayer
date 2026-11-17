import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import type { ScanResult } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const isApiConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const DOCUMENTS_BUCKET = "documents";

const supabase = isApiConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export function subscribeToAuth(listener: AuthListener) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(listener);
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<Session> {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(error?.message || "Sign-in failed.");
  return data.session;
}

export async function signUp(email: string, password: string): Promise<Session | null> {
  const { data, error } = await requireClient().auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) throw new Error(error.message);
}

function requireClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}

export async function loadDocuments(): Promise<ScanResult[]> {
  const { data, error } = await requireClient()
    .from("documents")
    .select("id, owner_id, file_name, page_label, document_type, subtype, fields, quality, blur_constant, ocr_confidence, duration_ms, warnings, image_path")
    .order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    fileName: row.file_name,
    pageLabel: row.page_label,
    imageUrl: "",
    imagePath: row.image_path,
    documentType: row.document_type,
    subtype: row.subtype,
    fields: row.fields,
    rawText: "",
    quality: row.quality,
    blurConstant: row.blur_constant,
    ocrConfidence: row.ocr_confidence,
    durationMs: row.duration_ms,
    warnings: row.warnings,
    saved: true,
  }));
}

function toRow(result: ScanResult, ownerId: string, imagePath: string) {
  return {
    id: result.id,
    owner_id: ownerId,
    file_name: result.fileName,
    page_label: result.pageLabel,
    image_path: imagePath,
    document_type: result.documentType,
    subtype: result.subtype,
    fields: result.fields,
    quality: result.quality,
    blur_constant: result.blurConstant,
    ocr_confidence: result.ocrConfidence,
    duration_ms: result.durationMs,
    warnings: result.warnings,
  };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("The processed image could not be prepared for secure storage.");
  return response.blob();
}

export async function getSignedImageUrl(imagePath: string): Promise<string> {
  const { data, error } = await requireClient().storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(imagePath, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message || "The document preview could not be loaded.");
  return data.signedUrl;
}

export async function saveDocument(result: ScanResult): Promise<string> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw new Error("Your session has expired. Please sign in again.");
  let imagePath = result.imagePath;
  if (!imagePath) {
    if (!result.imageUrl) throw new Error("The processed image is unavailable.");
    imagePath = `documents/${userData.user.id}/${result.id}.jpg`;
    const image = await dataUrlToBlob(result.imageUrl);
    const { error: uploadError } = await client.storage
      .from(DOCUMENTS_BUCKET)
      .upload(imagePath, image, { contentType: image.type || "image/jpeg", upsert: true });
    if (uploadError) throw new Error(uploadError.message);
  }
  const { error } = await client.from("documents").upsert(toRow(result, userData.user.id, imagePath), { onConflict: "id" });
  if (error) {
    await client.storage.from(DOCUMENTS_BUCKET).remove([imagePath]);
    throw new Error(error.message);
  }
  return imagePath;
}

export async function deleteDocument(id: string): Promise<void> {
  const client = requireClient();
  const { data, error: readError } = await client.from("documents").select("image_path").eq("id", id).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (data?.image_path) {
    const { error: storageError } = await client.storage.from(DOCUMENTS_BUCKET).remove([data.image_path]);
    if (storageError) throw new Error(storageError.message);
  }
  const { error } = await client.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = requireClient();
  const { data, error: readError } = await client.from("documents").select("image_path").in("id", ids);
  if (readError) throw new Error(readError.message);
  const paths = (data ?? []).map((row) => row.image_path).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: storageError } = await client.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (storageError) throw new Error(storageError.message);
  }
  const { error } = await client.from("documents").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteAllDocuments(): Promise<void> {
  const client = requireClient();
  const { data, error: readError } = await client.from("documents").select("image_path");
  if (readError) throw new Error(readError.message);
  const paths = (data ?? []).map((row) => row.image_path).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: storageError } = await client.storage.from(DOCUMENTS_BUCKET).remove(paths);
    if (storageError) throw new Error(storageError.message);
  }
  const { error } = await client.from("documents").delete().not("id", "is", null);
  if (error) throw new Error(error.message);
}




