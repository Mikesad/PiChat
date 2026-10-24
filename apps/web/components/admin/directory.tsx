"use client";

import type { DirectoryGroup, DirectoryMember } from "@pichat/shared";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AclSubject } from "@/lib/admin-data";
import { ApiError, apiErrorMessage, fetchDirectory } from "@/lib/api-client";
import { useAuth } from "../auth/auth-provider";

type DirectoryStatus = "loading" | "ready" | "error";

interface DirectoryContextValue {
  members: DirectoryMember[];
  groups: DirectoryGroup[];
  activeMembers: DirectoryMember[];
  status: DirectoryStatus;
  error: string | null;
  reload: () => Promise<void>;
  subjectName: (subject: AclSubject) => string;
  subjectMemberCount: (subject: AclSubject) => number;
}

const DirectoryContext = createContext<DirectoryContextValue | null>(null);

export function DirectoryProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [groups, setGroups] = useState<DirectoryGroup[]>([]);
  const [status, setStatus] = useState<DirectoryStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus((current) => (current === "ready" ? "ready" : "loading"));
    setError(null);

    try {
      const response = await fetchDirectory();
      if (requestId !== requestIdRef.current) {
        return;
      }
      setMembers(response.members);
      setGroups(response.groups);
      setStatus("ready");
    } catch (cause) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (cause instanceof ApiError && cause.status === 401) {
        void logout();
      }
      setError(apiErrorMessage(cause));
      setStatus("error");
    }
  }, [logout]);

  useEffect(() => {
    void reload();
    return () => {
      requestIdRef.current += 1;
    };
  }, [reload]);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member] as const)),
    [members],
  );
  const groupById = useMemo(
    () => new Map(groups.map((group) => [group.id, group] as const)),
    [groups],
  );
  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members],
  );

  const subjectName = useCallback(
    (subject: AclSubject) => {
      if (subject.type === "user") {
        return memberById.get(subject.id)?.displayName ?? "未知用户";
      }
      return groupById.get(subject.id)?.name ?? "未知部门";
    },
    [groupById, memberById],
  );

  const subjectMemberCount = useCallback(
    (subject: AclSubject) => {
      if (subject.type === "user") {
        return memberById.get(subject.id)?.status === "active" ? 1 : 0;
      }
      return groupById.get(subject.id)?.memberCount ?? 0;
    },
    [groupById, memberById],
  );

  return (
    <DirectoryContext.Provider
      value={{
        members,
        groups,
        activeMembers,
        status,
        error,
        reload,
        subjectName,
        subjectMemberCount,
      }}
    >
      {children}
    </DirectoryContext.Provider>
  );
}

export function useDirectory() {
  const value = useContext(DirectoryContext);
  if (!value) {
    throw new Error("useDirectory must be used within DirectoryProvider");
  }
  return value;
}
