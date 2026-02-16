"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Heart, Sparkles, ChevronLeft } from "lucide-react";
import { useSettingsStore } from "@/lib/store/settingsStore";

const DEFAULT_RETURN_TO = "/chat";

function resolveReturnTo(raw: string | null): string {
  if (!raw) {
    return DEFAULT_RETURN_TO;
  }

  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_RETURN_TO;
  }

  return value;
}

function QrCard({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all duration-200 hover:shadow-md">
      <h3 className="text-base font-semibold text-[#1E293B]">{title}</h3>
      <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>
      <div className="mx-auto mt-4 w-full max-w-[180px] sm:max-w-[200px] rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <Image
          src="/images/sponsor/qrcode.png"
          alt={`${title}收款二维码`}
          width={200}
          height={200}
          className="h-auto w-full rounded-lg"
          priority
        />
      </div>
    </article>
  );
}

export default function SponsorPage() {
  const router = useRouter();
  const enableVipMode = useSettingsStore((state) => state.enableVipMode);
  const [isActivating, setIsActivating] = useState(false);
  const [returnTo, setReturnTo] = useState(DEFAULT_RETURN_TO);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(resolveReturnTo(params.get("return_to")));
  }, []);

  const handleActivate = () => {
    if (isActivating) {
      return;
    }

    setIsActivating(true);
    enableVipMode();
    router.replace(returnTo);
  };

  return (
    <main className="relative min-h-screen bg-[#F8FAFC] overflow-x-hidden">
      {/* Background Elements - 与主页一致 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-100/60 to-transparent rounded-full blur-[100px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-indigo-100/40 to-transparent rounded-full blur-[80px]" />
      </div>

      {/* Navigation - 与主页一致 */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#2563EB] to-[#3B82F6] rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-[#1E293B]">二次元情感陪伴助手</span>
          </Link>
          
          <Link
            href={returnTo}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#475569] bg-white border border-slate-200 rounded-lg hover:border-[#2563EB]/30 hover:bg-slate-50 transition-colors duration-200"
          >
            <ChevronLeft className="w-4 h-4" />
            返回
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative pt-24 pb-12 px-4">
        <div className="mx-auto w-full max-w-2xl">
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-lg">
            <div className="mx-auto mb-6 w-fit rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#3B82F6] p-4 text-white shadow-md">
              <Heart className="h-8 w-8" />
            </div>

            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-[#1E293B]">
                喜欢白厄的话，请给我们一点支持
              </h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#64748B]">
                项目需要服务器和模型费用才能持续运行，你的每一份支持都能让我们继续稳定更新与陪伴。
              </p>
            </div>

            <div className="mt-6 rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-5 text-center">
              <p className="text-sm font-medium text-[#2563EB]">推荐支持金额</p>
              <div className="mt-2 flex items-center justify-center gap-2 text-[#2563EB]">
                <Coffee className="h-5 w-5" />
                <span className="text-sm font-medium">一杯咖啡的价格</span>
              </div>
              <p className="mt-3 text-4xl sm:text-5xl font-bold leading-none text-[#2563EB]">6元</p>
              <p className="mt-3 text-sm text-[#1D4ED8]">打赏 6 元即可支持项目持续更新</p>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="w-full max-w-[280px]">
                <QrCard title="微信支付" subtitle="扫码打赏" />
              </div>
            </div>

            <p className="mt-4 text-center text-xs font-medium text-[#2563EB]">
              请认准收款人：天小可
            </p>

            <button
              type="button"
              aria-label="我已打赏，启用VIP"
              onClick={handleActivate}
              disabled={isActivating}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-5 text-base font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#1D4ED8] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Sparkles className="h-5 w-5" />
              {isActivating ? "启用中..." : "我已打赏，启用VIP"}
            </button>

            <p className="mt-4 text-center text-xs text-[#64748B]">
              无论是否打赏，都可以启用 VIP。打赏完全自愿，感谢每一份心意。
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
