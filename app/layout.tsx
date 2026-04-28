import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { ConvexClientProvider } from "@/components/convex-client-provider";
import { EnsureConvexUser } from "@/components/ensure-convex-user";
import { LastVisitedProjectProvider } from "@/components/last-visited-project-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gemini 3 Flash Chat",
  description: "AI chat powered by Gemini 3 Flash via OpenRouter",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ClerkProvider>
          <ConvexClientProvider>
            <EnsureConvexUser>
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <LastVisitedProjectProvider>
                  {children}
                  <Toaster />
                  <Analytics />
                </LastVisitedProjectProvider>
              </ThemeProvider>
            </EnsureConvexUser>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
