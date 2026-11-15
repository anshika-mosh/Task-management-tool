/** Upload files to a ticket with progress reporting (XHR, since fetch has no upload progress). */
export function uploadFiles(ticketId: number, files: File[], onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/tickets/${ticketId}/attachments`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      try { reject(new Error(JSON.parse(xhr.responseText).error)); } catch { reject(new Error("Upload failed")); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}
