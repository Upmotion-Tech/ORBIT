import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { MotionConfig } from "framer-motion";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast-context";
import AuthGate from "@/components/auth/AuthGate";
import ToastContainer from "@/components/shell/ToastContainer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ORBIT",
  description: "Operational Revenue & Business Intelligence Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-brand="orbit" className={inter.variable}>
      <body>
        {/* reducedMotion="user" makes every motion.* animation in the app
            (Modal, sidebar, Button press feedback, ...) automatically
            respect the OS-level prefers-reduced-motion setting — transform/
            layout animation is disabled for those users, opacity fades
            still play. */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <AuthProvider>
              <AuthGate>{children}</AuthGate>
            </AuthProvider>
            <ToastContainer />
          </ToastProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
