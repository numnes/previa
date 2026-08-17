"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconBook,
  IconChevron,
  IconDashboard,
  IconFolder,
  IconGithub,
  IconLayers,
  IconLock,
  IconLogout,
  IconServer,
  IconSettings,
  IconUsers,
} from "./icons";
import { clearTokenClient } from "@/lib/client-auth";
import { useAuth } from "@/components/AuthProvider";
import { isAdmin } from "@/lib/client-auth";
import { isDemoMode } from "@/demo/mode";
import { previaVersionLabel } from "@/lib/version";

const SIDEBAR_OPEN_KEY = "previa-sidebar-open";

function readOpenState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SIDEBAR_OPEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, boolean>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeOpenState(state: Record<string, boolean>) {
  try {
    sessionStorage.setItem(SIDEBAR_OPEN_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function useSidebarGroupOpen(groupKey: string, defaultOpen: boolean) {
  const [open, setOpen] = useState(() => {
    const saved = readOpenState();
    if (groupKey in saved) return saved[groupKey];
    return defaultOpen;
  });

  const setOpenPersist = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setOpen((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        const saved = readOpenState();
        saved[groupKey] = next;
        writeOpenState(saved);
        return next;
      });
    },
    [groupKey],
  );

  return [open, setOpenPersist] as const;
}

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  children?: { href: string; label: string; icon: ReactNode }[];
};

function NavLink({
  href,
  label,
  icon,
  nested,
  active,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  nested?: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
        nested ? "pl-9" : ""
      } ${
        active
          ? "bg-[#3d4048] text-white"
          : "text-[#b8bcc4] hover:bg-[#2f3238] hover:text-[#e8eaed]"
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const childActive = item.children?.some(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
  );
  const selfActive = pathname === item.href;
  const [open, setOpen] = useSidebarGroupOpen(
    item.href,
    !!(childActive || selfActive),
  );
  const href = !!item.href
    ? item.href
    : item.children?.length
      ? item.children[0].href
      : "#";

  if (!item.children?.length) {
    return (
      <NavLink
        href={item.href}
        label={item.label}
        icon={item.icon}
        active={selfActive}
      />
    );
  }

  return (
    <div>
      <div
        className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition ${
          selfActive
            ? "text-white"
            : "text-[#b8bcc4] hover:bg-[#2f3238] hover:text-[#e8eaed]"
        } 
        ${
          selfActive
            ? "bg-[#3d4048] text-white"
            : "text-[#b8bcc4] hover:bg-[#2f3238] hover:text-[#e8eaed]"
        }`}
      >
        <Link className="flex w-full gap-2.5" href={href}>
          <span className="shrink-0 opacity-80">{item.icon}</span>
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <IconChevron className="h-3.5 w-3.5 opacity-50" open={open} />
        </button>
      </div>
      {open ? (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((c) => (
            <NavLink
              key={c.href}
              href={c.href}
              label={c.label}
              icon={c.icon}
              nested
              active={pathname === c.href}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(isDemoMode());
  }, []);

  const items = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      {
        href: "/",
        label: "Dashboard",
        icon: <IconDashboard />,
      },
      {
        href: "/projects",
        label: "Projects",
        icon: <IconFolder />,
        children: [
          { href: "/instances", label: "Instances", icon: <IconLayers /> },
        ],
      },
    ];

    if (isAdmin(user)) {
      base.push(
        {
          href: "/users",
          label: "Users",
          icon: <IconUsers />,
        },
        {
          href: "/settings",
          label: "Settings",
          icon: <IconSettings />,
        },
      );
    }

    base.push({
      href: "",
      label: "Setup",
      icon: <IconBook />,
      children: [
        {
          href: "/setup/github-actions",
          label: "GitHub Actions",
          icon: <IconGithub />,
        },
        { href: "/setup/secrets", label: "Secrets", icon: <IconLock /> },
        { href: "/setup/nginx", label: "Nginx", icon: <IconServer /> },
      ],
    });

    return base;
  }, [user]);

  return (
    <aside className="flex h-[100wh] w-56 shrink-0 flex-col border-r border-[#3d4048] bg-[#1f2124]">
      <div className="border-b border-[#3d4048] px-4 py-4">
        <Link href="/" className="block">
          <div className="text-sm font-semibold tracking-wide text-[#e8eaed]">
            Previa
          </div>
          <div className="text-xs text-[#8b919a]">preview environments</div>
        </Link>
        {demo ? (
          <div className="mt-2 inline-flex rounded border border-amber-400/30 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-100/90">
            Demo data
          </div>
        ) : null}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => (
          <NavGroup key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
      <div className="border-t border-[#3d4048] p-2">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[#b8bcc4] transition hover:bg-[#2f3238] hover:text-[#e8eaed]"
          onClick={() => {
            clearTokenClient();
            router.push("/login");
          }}
        >
          <IconLogout />
          Sign out
        </button>
        <p
          className="mt-1 px-3 pb-1 text-[10px] tabular-nums tracking-wide text-[#6b7280]"
          title="Previa build version"
        >
          {previaVersionLabel()}
        </p>
      </div>
    </aside>
  );
}
