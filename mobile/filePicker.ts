import type { FileLikeInput } from "./innovatorDomain";

export interface PickedDocumentAsset extends FileLikeInput {
  uri: string;
  name: string;
  size: number;
  type: string;
  file?: Blob;
}

export async function pickEvidenceDocument(): Promise<PickedDocumentAsset | null> {
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets || !result.assets[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || "evidence-document",
    size: typeof asset.size === "number" ? asset.size : 0,
    type: asset.mimeType || "application/octet-stream",
    file: (asset as { file?: Blob }).file,
  };
}
