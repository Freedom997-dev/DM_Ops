// Browser side of direct-to-storage uploads (see requestHkMediaUploads).
//
// Sends one file to a signed upload URL as multipart form data, the same shape
// supabase-js `uploadToSignedUrl` uses, so the URL can be a Supabase signed
// upload URL in production or the /api/local-uploads route in local dev.
// XMLHttpRequest instead of fetch because only XHR reports upload progress.

export function uploadToSignedUrl(
  url: string,
  file: File,
  onProgress?: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size);
        resolve();
        return;
      }
      let detail = "";
      try {
        const json = JSON.parse(xhr.responseText);
        detail = json.message || json.error || "";
      } catch {
        // non-JSON error body
      }
      reject(new Error(`Upload of ${file.name} failed (${xhr.status}${detail ? `: ${detail}` : ""}).`));
    };
    xhr.onerror = () => reject(new Error(`Upload of ${file.name} failed — check the connection and try again.`));
    xhr.send(body);
  });
}
