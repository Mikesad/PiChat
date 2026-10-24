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
  departmentId: "group-1",
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

  function document(id: string, aclMode: "inherit" | "restricted" = "inherit") {
    return { id, knowledgeBaseId: "kb-1", aclMode };
  }

  function exception(
    documentId: string,
    permission: "read" | "deny",
    subjectType: "user" | "group" = "user",
    subjectId = subjectType === "user" ? "user-1" : "group-1",
  ): AclEntry {
    return {
      tenantId: "tenant-1",
      documentId,
      knowledgeBaseId: "kb-1",
      subjectType,
      subjectId,
      permission,
    };
  }

  it("allows an inherited document when the department can access the knowledge base", () => {
    expect(
      decideEffectiveDocumentAccess(defaults, [], principal, document("doc-1", "inherit")),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("denies an inherited document when the department cannot access the knowledge base", () => {
    const outsider: AccessPrincipal = { ...principal, departmentId: "group-2" };
    expect(
      decideEffectiveDocumentAccess(defaults, [], outsider, document("doc-1", "inherit")),
    ).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("does not let a document grant bypass the knowledge base permission", () => {
    const outsider: AccessPrincipal = { ...principal, departmentId: "group-2" };
    expect(
      decideEffectiveDocumentAccess(
        defaults,
        [exception("doc-1", "read", "group", "group-2")],
        outsider,
        document("doc-1", "restricted"),
      ),
    ).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("denies a restricted document without a matching document grant", () => {
    expect(
      decideEffectiveDocumentAccess(defaults, [], principal, document("doc-1", "restricted")),
    ).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("allows a restricted document with a matching department grant", () => {
    expect(
      decideEffectiveDocumentAccess(
        defaults,
        [exception("doc-1", "read", "group", "group-1")],
        principal,
        document("doc-1", "restricted"),
      ),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("allows a restricted document with a matching user grant", () => {
    expect(
      decideEffectiveDocumentAccess(
        defaults,
        [exception("doc-1", "read", "user", "user-1")],
        principal,
        document("doc-1", "restricted"),
      ),
    ).toEqual({ allowed: true, reason: "allowed" });
  });

  it("lets a document deny override a restricted document grant", () => {
    expect(
      decideEffectiveDocumentAccess(
        defaults,
        [exception("doc-1", "read"), exception("doc-1", "deny")],
        principal,
        document("doc-1", "restricted"),
      ),
    ).toEqual({ allowed: false, reason: "explicit_deny" });
  });

  it("lets a knowledge base deny override a document grant", () => {
    const deniedDefaults: KnowledgeBaseAclEntry[] = [
      ...defaults,
      {
        tenantId: "tenant-1",
        knowledgeBaseId: "kb-1",
        subjectType: "group",
        subjectId: "group-1",
        permission: "deny",
      },
    ];
    expect(
      decideEffectiveDocumentAccess(
        deniedDefaults,
        [exception("doc-1", "read")],
        principal,
        document("doc-1", "restricted"),
      ),
    ).toEqual({ allowed: false, reason: "explicit_deny" });
  });

  it("lets a tenant_admin read every document", () => {
    const admin: AccessPrincipal = { ...principal, role: "tenant_admin" };
    expect(
      decideEffectiveDocumentAccess(
        [],
        [exception("doc-1", "deny")],
        admin,
        document("doc-1", "restricted"),
      ),
    ).toEqual({ allowed: true, reason: "role_override" });
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
    expect(
      decideEffectiveDocumentAccess(foreignDefaults, [], principal, document("doc-1", "inherit")),
    ).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("fails closed for an unknown document mode", () => {
    expect(
      decideEffectiveDocumentAccess(defaults, [], principal, {
        id: "doc-1",
        knowledgeBaseId: "kb-1",
        aclMode: "invalid" as "inherit",
      }),
    ).toEqual({ allowed: false, reason: "no_grant" });
  });

  it("lists readable documents using knowledge base permission and mode", () => {
    const documents = [
      document("doc-inherit", "inherit"),
      document("doc-restricted", "restricted"),
      document("doc-restricted-granted", "restricted"),
    ];
    const exceptions = [exception("doc-restricted-granted", "read", "group", "group-1")];
    expect(listEffectiveReadableDocumentIds(defaults, exceptions, principal, documents)).toEqual([
      "doc-inherit",
      "doc-restricted-granted",
    ]);
  });
});
