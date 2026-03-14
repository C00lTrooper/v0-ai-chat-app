"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY_ID = "lastVisitedProjectId";
const STORAGE_KEY_NAME = "lastVisitedProjectName";

type LastVisitedProject = {
  projectId: string | null;
  projectName: string | null;
};

type LastVisitedProjectContextValue = LastVisitedProject & {
  setLastVisitedProject: (projectId: string, projectName: string) => void;
  clearLastVisitedProject: () => void;
};

const LastVisitedProjectContext =
  createContext<LastVisitedProjectContextValue | null>(null);

function readStored(): LastVisitedProject {
  if (typeof window === "undefined") {
    return { projectId: null, projectName: null };
  }
  const id = window.localStorage.getItem(STORAGE_KEY_ID);
  const name = window.localStorage.getItem(STORAGE_KEY_NAME);
  return {
    projectId: id,
    projectName: name,
  };
}

export function LastVisitedProjectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<LastVisitedProject>(readStored);

  const setLastVisitedProject = useCallback(
    (projectId: string, projectName: string) => {
      setState({ projectId, projectName });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_ID, projectId);
        window.localStorage.setItem(STORAGE_KEY_NAME, projectName);
      }
    },
    [],
  );

  const clearLastVisitedProject = useCallback(() => {
    setState({ projectId: null, projectName: null });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY_ID);
      window.localStorage.removeItem(STORAGE_KEY_NAME);
    }
  }, []);

  useEffect(() => {
    if (pathname === "/projects") {
      clearLastVisitedProject();
    }
  }, [pathname, clearLastVisitedProject]);

  const value = useMemo<LastVisitedProjectContextValue>(
    () => ({
      ...state,
      setLastVisitedProject,
      clearLastVisitedProject,
    }),
    [state.projectId, state.projectName, setLastVisitedProject, clearLastVisitedProject],
  );

  return (
    <LastVisitedProjectContext.Provider value={value}>
      {children}
    </LastVisitedProjectContext.Provider>
  );
}

export function useLastVisitedProject(): LastVisitedProjectContextValue | null {
  return useContext(LastVisitedProjectContext);
}
