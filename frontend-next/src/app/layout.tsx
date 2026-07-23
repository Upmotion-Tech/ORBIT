import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
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
        <ToastProvider>
          <AuthProvider>
            <AuthGate>{children}</AuthGate>
          </AuthProvider>
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}
