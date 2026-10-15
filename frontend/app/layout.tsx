import type {Metadata} from "next";
import "./globals.css";
export const metadata:Metadata={title:"Inventory — Stock & Accounts",description:"A clear view of your stock, invoices, and balances. English and Arabic."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;}
