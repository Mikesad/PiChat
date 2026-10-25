"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Icon, LogoMark, Spinner } from "../icons";
import { ThemeToggle } from "../theme-toggle";
import { useAuth } from "./auth-provider";

interface LoginErrors {
  email?: string;
  password?: string;
  form?: string;
}

const seedAccounts = [
  {
    name: "张明",
    role: "租户管理员",
    email: "zhangming@qq.com",
  },
  {
    name: "陈晨",
    role: "产品部成员",
    email: "chenchen@qq.com",
  },
  {
    name: "赵敏",
    role: "财务部成员",
    email: "zhaomin@qq.com",
  },
  {
    name: "王芳",
    role: "综合部成员",
    email: "wangfang@qq.com",
  },
];

const highlights = [
  {
    icon: "shield-check" as const,
    title: "权限过滤检索",
    description: "每次检索都带服务端计算的文档范围，拒绝优先。",
  },
  {
    icon: "sparkles" as const,
    title: "过程可追溯",
    description: "思考、工具调用与引用来源全部可见。",
  },
  {
    icon: "quote" as const,
    title: "引用可核对",
    description: "回答中的引用可以定位到具体文档片段。",
  },
];

function loginErrorFor(error: unknown): LoginErrors {
  if (error instanceof ApiError) {
    if (error.code === "user_not_found") {
      return {
        email: "该邮箱尚未开通账号。",
        form: "邮箱不存在，请使用下方演示账号或联系管理员。",
      };
    }
    if (error.code === "invalid_password") {
      return { password: "密码错误。", form: "密码不正确，请重新输入。" };
    }
    if (error.code === "account_disabled") {
      return { form: "账号已停用，请联系管理员。" };
    }
    if (error.code === "invalid_request") {
      return { form: "请输入有效的邮箱和密码。" };
    }
    return { form: error.message };
  }
  return { form: "无法连接登录服务，请确认 API 已启动后重试。" };
}

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("zhangming@qq.com");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const nextErrors: LoginErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "请输入有效的邮箱";
    }
    if (password.trim().length === 0) {
      nextErrors.password = "请输入密码";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors({
        ...nextErrors,
        form: "请检查邮箱和密码后再登录。",
      });
      if (nextErrors.email) {
        emailRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (error) {
      const next = loginErrorFor(error);
      setErrors(next);
      if (next.email) {
        emailRef.current?.focus();
      } else if (next.password) {
        passwordRef.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fillAccount(accountEmail: string) {
    setEmail(accountEmail);
    setPassword("123456");
    setErrors({});
    passwordRef.current?.focus();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-surface lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative flex flex-1 flex-col p-10 xl:p-14">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <div>
              <p className="text-sm font-semibold tracking-tight">PiChat</p>
              <p className="text-[11px] text-subtle">企业知识库 Agent</p>
            </div>
          </div>

          <div className="my-auto max-w-md py-10">
            <p className="text-[11px] font-semibold tracking-wider text-accent-text uppercase">
              Enterprise Knowledge Agent
            </p>
            <p className="mt-3 text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
              让每个答案，都有权限依据。
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              基于 Pi SDK 与
              RAGFlow，回答只检索当前账号有权阅读的文档，并展示可追溯的引用与工具调用。
            </p>

            <ul className="mt-8 space-y-4">
              {highlights.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                    <Icon name={item.icon} size={15} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5 text-subtle">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-subtle">
            <Icon name="lock" size={12} />
            内网部署 · 数据不离开企业边界
          </p>
        </div>
      </aside>

      <main className="flex min-h-dvh flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <LogoMark />
            <div>
              <p className="text-sm font-semibold tracking-tight">PiChat</p>
              <p className="text-[11px] text-subtle">企业知识库 Agent</p>
            </div>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-4 pb-8 sm:px-6">
          <div className="w-full max-w-sm">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
              <p className="text-[11px] font-semibold tracking-wider text-accent-text uppercase">
                Sign in
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">登录 PiChat</h1>
              <p className="mt-1.5 text-sm leading-6 text-muted">
                使用本地账号进入知识库 Agent。回答只检索你有权访问的文档。
              </p>

              {errors.form ? (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs leading-5 text-danger"
                >
                  <Icon name="alert-circle" size={14} className="mt-0.5 shrink-0" />
                  {errors.form}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                <div>
                  <label htmlFor="login-email" className="text-xs font-medium text-fg">
                    邮箱
                  </label>
                  <input
                    ref={emailRef}
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setErrors((previous) => ({ ...previous, email: undefined, form: undefined }));
                    }}
                    autoComplete="email"
                    placeholder="name@example.com"
                    aria-invalid={errors.email ? true : undefined}
                    aria-describedby={errors.email ? "login-email-error" : undefined}
                    className={cn(
                      "mt-1.5 h-11 w-full rounded-lg border bg-surface px-3 text-base text-fg transition-colors placeholder:text-subtle focus:border-accent sm:text-sm",
                      errors.email ? "border-danger" : "border-border",
                    )}
                  />
                  {errors.email ? (
                    <p id="login-email-error" className="mt-1 text-xs text-danger">
                      {errors.email}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="login-password" className="text-xs font-medium text-fg">
                    密码
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      ref={passwordRef}
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setErrors((previous) => ({
                          ...previous,
                          password: undefined,
                          form: undefined,
                        }));
                      }}
                      autoComplete="current-password"
                      placeholder="输入密码"
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={errors.password ? "login-password-error" : undefined}
                      className={cn(
                        "h-11 w-full rounded-lg border bg-surface px-3 pr-11 text-base text-fg transition-colors placeholder:text-subtle focus:border-accent sm:text-sm",
                        errors.password ? "border-danger" : "border-border",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((previous) => !previous)}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                      title={showPassword ? "隐藏密码" : "显示密码"}
                      className="absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                    </button>
                  </div>
                  {errors.password ? (
                    <p id="login-password-error" className="mt-1 text-xs text-danger">
                      {errors.password}
                    </p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Spinner className="size-3.5" /> : null}
                  {submitting ? "正在登录…" : "登录"}
                </button>
              </form>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-border bg-surface-2/60 px-3.5 py-3 text-[11px] leading-5 text-subtle">
              <p className="font-medium text-muted">演示账号</p>
              <p className="mt-1">本地数据库账号，密码统一为 123456。选择账号可自动填入。</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {seedAccounts.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillAccount(account.email)}
                    className="cursor-pointer rounded-lg border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    <span className="block text-xs font-medium text-fg">
                      {account.name} · {account.role}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[10px] text-subtle">
                      {account.email}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="px-4 pb-6 text-center text-[11px] text-subtle sm:px-6">
          内部系统 · 仅限授权员工访问
        </footer>
      </main>
    </div>
  );
}
