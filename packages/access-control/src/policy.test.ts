import { describe, expect, it } from "vitest";
import { decideDocumentAccess, listReadableDocumentIds } from "./policy.js";
import type { AccessPrincipal, AclEntry } from "./types.js";

const principal: AccessPrincipal = {
  tenantId: "tenant-1",
  userId: "user-1",
  groupIds: ["group-1"],
  role: "member",
};

const entries: AclEntry[] = [
  {
    documentId: "doc-user",
    knowledgeBaseId: "kb-1",
    subjectType: "user",
    subjectId: "user-1",
    permission: "read",
  },
  {
    documentId: "doc-group",
    knowledgeBaseId: "kb-1",
    subjectType: "group",
    subjectId: "group-1",
    permission: "read",
  },
  {
    documentId: "doc-denied",
    knowledgeBaseId: "kb-1",
    subjectType: "group",
    subjectId: "group-1",
    permission: "read",
  },
  {
    documentId: "doc-denied",
    knowledgeBaseId: "kb-1",
    subjectType: "user",
    subjectId: "user-1",
    permission: "deny",
  },
  {
    documentId: "doc-other-user",
    knowledgeBaseId: "kb-1",
    subjectType: "user",
    subjectId: "user-2",
    permission: "read",
  },
];

describe("document access policy", () => {
  it("allows an explicit user grant", () => {
    expect(decideDocumentAccess(entries, principal, "doc-user")).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  it("allows a group grant", () => {
    expect(decideDocumentAccess(entries, principal, "doc-group")).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  it("lets an explicit deny override a grant", () => {
    expect(decideDocumentAccess(entries, principal, "doc-denied")).toEqual({
      allowed: false,
      reason: "explicit_deny",
    });
  });

  it("denies documents with no grant", () => {
    expect(decideDocumentAccess(entries, principal, "doc-other-user")).toEqual({
      allowed: false,
      reason: "no_grant",
    });
  });

  it("lists only readable documents", () => {
    expect(listReadableDocumentIds(entries, principal).sort()).toEqual(["doc-group", "doc-user"]);
  });

  it("lets a tenant_admin read every document, including explicit denies", () => {
    const admin: AccessPrincipal = { ...principal, userId: "admin-1", role: "tenant_admin" };
    expect(decideDocumentAccess(entries, admin, "doc-denied")).toEqual({
      allowed: true,
      reason: "role_override",
    });
  });

  it("lists every supplied document for a tenant_admin", () => {
    const admin: AccessPrincipal = { ...principal, userId: "admin-1", role: "tenant_admin" };
    expect(listReadableDocumentIds(entries, admin, ["doc-denied", "doc-without-acl"])).toEqual([
      "doc-denied",
      "doc-without-acl",
    ]);
  });

  it("keeps documents without entries private for members", () => {
    expect(listReadableDocumentIds(entries, principal, ["doc-without-acl"])).toEqual([]);
  });
});
