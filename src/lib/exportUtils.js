export function downloadBase64File(base64, filename, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  try {
    if (!base64 || typeof base64 !== 'string') {
      console.warn('downloadBase64File: String Base64 kosong atau tidak valid.');
      return;
    }

    // 1. Bersihkan prefix Data URL jika ada (e.g. data:application/vnd...;base64,)
    let cleanBase64 = base64.replace(/^data:.*;base64,/, '');

    // 2. Hapus whitespace, newline, dan spasi yang sering merusak string Base64
    cleanBase64 = cleanBase64.replace(/\s/g, '');

    // 3. Fix padding Base64 jika karakter terpotong
    const missingPadding = cleanBase64.length % 4;
    if (missingPadding) {
      cleanBase64 += '='.repeat(4 - missingPadding);
    }

    // 4. Dekode secara aman
    const binary = window.atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Base64 Decode Error]:', err);
  }
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(headers, rows, filename) {
  try {
    const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[CSV Download Error]:', err);
  }
}