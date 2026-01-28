import "./globals.css";
import Sidebar from "./client-components/left-sidebar";

export default function RootLayout({ children }) {

  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
