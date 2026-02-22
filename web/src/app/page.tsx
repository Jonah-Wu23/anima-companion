"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { 
  MessageCircle, 
  Mic, 
  Brain, 
  Box,
  ChevronRight,
  Star,
  Heart,
  Sparkles
} from "lucide-react";

import { useLegalDocumentModal } from "@/components/legal/use-legal-document-modal";

const features = [
  {
    icon: MessageCircle,
    title: "文字对话",
    description: "随时随地，用文字分享你的心情与想法",
  },
  {
    icon: Mic,
    title: "语音陪伴",
    description: "像和朋友聊天一样，用声音传递温暖",
  },
  {
    icon: Brain,
    title: "记忆共鸣",
    description: "记住你们的故事，越聊越懂你",
  },
  {
    icon: Box,
    title: "3D 互动",
    description: "逼真的角色表现，让陪伴更有温度",
  },
];

export default function HomePage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const { legalDocs, openLegalDocument, legalDocumentModal } = useLegalDocumentModal();
  const heroBackgrounds = ['/images/hero-compressed.webp', '/images/hero-luotianyi-illustration-01-compressed.jpg'];

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroBackgrounds.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [heroBackgrounds.length]);

  return (
    <main className="relative min-h-screen bg-[#F8FAFC] overflow-x-hidden">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-100/60 to-transparent rounded-full blur-[100px]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-indigo-100/40 to-transparent rounded-full blur-[80px]" />
      </div>

      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#2563EB] to-[#3B82F6] rounded-lg flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-semibold text-[#1E293B]">二次元情感陪伴助手</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-[#475569] hover:text-[#1E293B] transition-colors duration-200">
              功能
            </a>
            <Link href="/login" className="text-sm font-medium text-[#475569] hover:text-[#1E293B] transition-colors duration-200">
              登录
            </Link>
          </nav>

          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-[#1E293B] rounded-lg hover:bg-[#334155] transition-colors duration-200 shadow-sm"
          >
            开始使用
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 px-6 overflow-hidden">
        {/* Hero Background Image */}
        <div className="absolute inset-0">
          {heroBackgrounds.map((background, index) => (
            <div
              key={background}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000"
              style={{
                backgroundImage: `url(${background})`,
                opacity: heroIndex === index ? 1 : 0,
              }}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#F8FAFC]/70 via-[#F8FAFC]/50 to-[#F8FAFC]" />
        
        <div className="relative mx-auto max-w-5xl">
          <div className="text-center max-w-2xl mx-auto">
            {/* Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm mb-8 transition-all duration-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <span className="text-sm font-medium text-[#475569]">❤️ 永久免费 · 为爱发电</span>
            </div>

            {/* Title */}
            <h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold text-[#1E293B] leading-[1.15] mb-6 transition-all duration-500 delay-100 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              跨越次元
              <span className="block mt-2 text-[#2563EB]">遇见羁绊</span>
            </h1>

            {/* Subtitle */}
            <p className={`text-lg text-[#475569] max-w-lg mx-auto mb-10 leading-relaxed transition-all duration-500 delay-200 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              支持 文字对话、语音通话、3D互动，选择你心动的角色，开启一段温暖而有意义的旅程
            </p>

            {/* CTA Buttons */}
            <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-500 delay-300 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-white bg-[#2563EB] rounded-xl hover:bg-[#1D4ED8] transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5"
              >
                免费开始体验
                <ChevronRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-4 text-base font-semibold text-[#475569] bg-white rounded-xl border border-slate-200 hover:border-[#2563EB]/30 hover:bg-slate-50 transition-all duration-200"
              >
                已有账号登录
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-20 px-6">
        <div className="mx-auto max-w-5xl">
          {/* Section Header */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1E293B] mb-4">
              温暖的陪伴方式
            </h2>
            <p className="text-lg text-[#475569] max-w-md mx-auto">
              注册即可使用全部功能，无需任何费用
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className={`group relative p-6 bg-white rounded-xl border border-slate-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-[#2563EB]/20 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: `${(index + 1) * 100}ms` }}
              >
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200">
                  <feature.icon className="w-6 h-6 text-[#2563EB]" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-[#1E293B] mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-[#475569] leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="relative py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1E293B] mb-8">
                为什么选择我们？
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-[#2563EB]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#1E293B] mb-1">完全免费</h3>
                    <p className="text-[#475569] text-sm">所有功能免费开放，无需订阅，没有隐藏费用</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                    <Heart className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#1E293B] mb-1">自然陪伴</h3>
                    <p className="text-[#475569] text-sm">支持多种交流方式，对话流畅自然，像朋友一样</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#FDF4FF] flex items-center justify-center flex-shrink-0">
                    <Brain className="w-5 h-5 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#1E293B] mb-1">持续成长</h3>
                    <p className="text-[#475569] text-sm">不断优化体验，定期推出新功能</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right - CTA Card */}
            <div className="relative">
              <div className="bg-gradient-to-br from-[#1E293B] to-[#334155] rounded-2xl p-8 text-white shadow-xl">
                <h3 className="text-2xl font-bold mb-3">准备好开始了吗？</h3>
                <p className="text-slate-300 mb-8 text-sm">
                  只需30秒注册，即可体验完整的陪伴服务
                </p>
                <div className="space-y-3">
                  <Link
                    href="/register"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-semibold text-[#1E293B] bg-white rounded-xl hover:bg-slate-100 transition-colors duration-200"
                  >
                    立即注册
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium text-white border border-white/20 rounded-xl hover:bg-white/10 transition-colors duration-200"
                  >
                    登录账号
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="relative py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-amber-100 rounded-2xl mb-6">
            <Star className="w-7 h-7 text-amber-600 fill-amber-600" />
          </div>
          <h2 className="text-3xl font-bold text-[#1E293B] mb-4">
            喜欢本项目？支持我们
          </h2>
          <p className="text-[#475569] mb-8 max-w-md mx-auto">
            项目需要服务器和AI模型费用才能持续运行，你的每一份支持都让我们能做得更好
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-8">
            <div className="bg-white px-8 py-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-[#94A3B8] mb-1 uppercase tracking-wide">推荐支持</div>
              <div className="text-4xl font-bold text-[#1E293B]">
                6<span className="text-lg text-[#64748B] ml-1">元</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-left">
              <div className="flex items-center gap-2 text-sm text-[#475569]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-emerald-600 text-xs font-bold">✓</span>
                </div>
                不打赏也能用
              </div>
              <div className="flex items-center gap-2 text-sm text-[#475569]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-emerald-600 text-xs font-bold">✓</span>
                </div>
                功能完全免费
              </div>
              <div className="flex items-center gap-2 text-sm text-[#475569]">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                  <span className="text-amber-600 text-xs">★</span>
                </div>
                感谢每一份心意
              </div>
            </div>
          </div>
          
          <Link
            href="/sponsor"
            className="inline-flex items-center gap-2 px-8 py-4 text-sm font-semibold text-white bg-[#2563EB] rounded-xl hover:bg-[#1D4ED8] transition-colors duration-200 shadow-md"
          >
            去打赏支持
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-10 px-6 border-t border-slate-200">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-[#2563EB] to-[#3B82F6] rounded-lg flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-[#1E293B]">二次元情感陪伴助手</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-[#64748B]">
                <Link href="/login" className="hover:text-[#1E293B] transition-colors duration-200">登录</Link>
                <Link href="/register" className="hover:text-[#1E293B] transition-colors duration-200">注册</Link>
                <a
                  href={legalDocs.terms.href}
                  onClick={(event) => {
                    event.preventDefault();
                    void openLegalDocument("terms");
                  }}
                  className="hover:text-[#1E293B] transition-colors duration-200"
                >
                  服务条款
                </a>
                <a
                  href={legalDocs.privacy.href}
                  onClick={(event) => {
                    event.preventDefault();
                    void openLegalDocument("privacy");
                  }}
                  className="hover:text-[#1E293B] transition-colors duration-200"
                >
                  隐私政策
                </a>
                <a
                  href="https://github.com/Jonah-Wu23/anima-companion"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[#1E293B] transition-colors duration-200"
                >
                  GitHub仓库
                </a>
              </div>
            </div>

            <div className="text-xs leading-6 text-[#94A3B8] text-center md:text-left">
              <p>© 2026 二次元情感陪伴助手. All rights reserved.</p>
              <p>本项目聚焦二次元角色互动体验，相关角色与素材版权归各自权利人所有。</p>
              <p>如涉及侵权、授权或内容异议，请通过 GitHub 仓库反馈处理。</p>
            </div>
          </div>
        </div>
      </footer>
      {legalDocumentModal}
    </main>
  );
}
