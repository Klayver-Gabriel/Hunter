export function exportJSON(sheet) {
    const blob = new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = String(sheet.character.info.name || 'cacador').trim().replace(/[^a-z0-9\-_]+/gi, '_').toLowerCase();
    a.href = url;
    a.download = `hunterscodex_${safeName || 'ficha'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

export function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
