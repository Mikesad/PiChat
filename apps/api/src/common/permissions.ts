export function canManageSharedConfigs(role: string): boolean {
  return role === "tenant_admin";
}
