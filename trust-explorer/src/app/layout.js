import './globals.css'

export const metadata = {
  title: 'ProWork Trust Explorer',
  description: 'Explore the ProWork trust network',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
