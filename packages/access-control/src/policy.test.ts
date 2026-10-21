import { describe, expect, it } from "vitest";
import {
  decideDocumentAccess,
  decideEffectiveDocumentAccess,
  listEffectiveReadableDocumentIds,
  listReadableDocumentIds,
} from "./policy.js";
import type { AccessPrincipal, AclEntry, KnowledgeBaseAclEntry } from "./types.js";

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

describe("effective document access policy", () => {
  const defaults: KnowledgeBaseAclEntry[] = [
    {
      tenantId: "tenant-1",
      knowledgeBaseId: "kb-1",
      subjectType: "group",
      subjectId: "group-1",
      permission: "read",
    },
  ];

  it("applies the knowledge base default grant", () => {
    expect(decideEffectiveDocumentAccess(defaults, [], principal, "doc-1", "kb-1")).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  it("applies a document read exception without a default grant", () => {
    const exception: AclEntry[] = [
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "read",
      },
    ];
    expect(decideEffectiveDocumentAccess([], exception, principal, "doc-1", "kb-1")).toEqual({
      allowed: true,
      reason: "allowed",
    });
  });

  it("lets a document deny override the knowledge base default", () => {
    const exception: AclEntry[] = [
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        subjectType: "group",
        subjectId: "group-1",
        permission: "deny",
      },
    ];
    expect(decideEffectiveDocumentAccess(defaults, exception, principal, "doc-1", "kb-1")).toEqual({
      allowed: false,
      reason: "explicit_deny",
    });
  });

  it("lets a user deny override a document group read", () => {
    const exceptions: AclEntry[] = [
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        subjectType: "group",
        subjectId: "group-1",
        permission: "read",
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "deny",
      },
    ];
    expect(decideEffectiveDocumentAccess([], exceptions, principal, "doc-1", "kb-1")).toEqual({
      allowed: false,
      reason: "explicit_deny",
    });
  });

  it("lets a tenant_admin read everything", () => {
    const admin: AccessPrincipal = { ...principal, role: "tenant_admin" };
    const exception: AclEntry[] = [
      {
        tenantId: "tenant-1",
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "deny",
      },
    ];
    expect(decideEffectiveDocumentAccess([], exception, admin, "doc-1", "kb-1")).toEqual({
      allowed: true,
      reason: "role_override",
    });
  });

  it("ignores ACL entries from another tenant", () => {
    const foreignDefaults: KnowledgeBaseAclEntry[] = [
      {
        tenantId: "tenant-2",
        knowledgeBaseId: "kb-1",
        subjectType: "group",
        subjectId: "group-1",
        permission: "read",
      },
    ];
    const foreignExceptions: AclEntry[] = [
      {
        tenantId: "tenant-2",
        documentId: "doc-1",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "read",
      },
      {
        tenantId: "tenant-2",
        documentId: "doc-2",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "deny",
      },
    ];
    expect(
      decideEffectiveDocumentAccess(foreignDefaults, foreignExceptions, principal, "doc-1", "kb-1"),
    ).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("denies when there is no default or exception grant", () => {
    expect(decideEffectiveDocumentAccess(defaults, [], principal, "doc-1", "kb-2")).toEqual({
      allowed: false,
      reason: "no_grant",
    });
  });

  it("lists readable documents across defaults and exceptions", () => {
    const exceptions: AclEntry[] = [
      {
        tenantId: "tenant-1",
        documentId: "doc-2",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "read",
      },
      {
        tenantId: "tenant-1",
        documentId: "doc-3",
        knowledgeBaseId: "kb-1",
        subjectType: "user",
        subjectId: "user-1",
        permission: "deny",
      },
    ];
    const documents = [
      { id: "doc-1", knowledgeBaseId: "kb-1" },
      { id: "doc-2", knowledgeBaseId: "kb-1" },
      { id: "doc-3", knowledgeBaseId: "kb-1" },
      { id: "doc-4", knowledgeBaseId: "kb-2" },
    ];
    expect(listEffectiveReadableDocumentIds(defaults, exceptions, principal, documents)).toEqual([
      "doc-1",
      "doc-2",
    ]);
  });
});
