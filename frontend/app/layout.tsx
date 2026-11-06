import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
    title: "Octate — Surgical annotation",
    description: "AI-assisted surgical video annotation and review.",
    icons: {
        icon: "/OctoLabel.png",
    },
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
