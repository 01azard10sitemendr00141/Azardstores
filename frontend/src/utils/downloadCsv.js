// Admin CSV export endpoints require auth, so a plain <a href> link won't
// carry the Bearer token — fetch as a blob through the authenticated axios
// instance instead, then trigger the browser download manually.
export async function downloadCsv(api, path, filename) {
  const res = await api.get(path, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
