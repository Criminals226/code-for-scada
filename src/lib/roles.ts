/** Backend stores role as lowercase `admin` | `operator`. */
export function isAdminRole(role: string | undefined | null): boolean {
  return String(role || '').toLowerCase() === 'admin';
}
