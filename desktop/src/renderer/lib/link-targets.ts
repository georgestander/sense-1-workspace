export function isExternalUrl(target: string): boolean {
  return /^https?:\/\//i.test(target.trim());
}

export function isFilePath(target: string): boolean {
  if (isExternalUrl(target)) {
    return false;
  }

  return /^[./~]/.test(target) || /^[a-zA-Z]:\\/.test(target) || /\.\w{1,5}$/.test(target);
}
