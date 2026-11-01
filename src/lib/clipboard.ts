/**
 * Utility untuk menyalin teks ke clipboard dengan dukungan fallback document.execCommand('copy')
 * untuk mengatasi pembatasan izin browser pada koneksi HTTP non-localhost atau dev tunnel.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Coba gunakan modern Clipboard API jika tersedia
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard.writeText gagal/dibatasi, mencoba fallback...", err);
    }
  }

  // 2. Fallback via textarea tersembunyi & document.execCommand('copy')
  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "-9999px";
      textArea.style.left = "-9999px";
      textArea.style.opacity = "0";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("Fallback document.execCommand copy gagal:", err);
      return false;
    }
  }

  return false;
}
