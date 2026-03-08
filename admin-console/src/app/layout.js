import './globals.css'

export const metadata = {
  title: 'ProWork Admin Console',
  description: 'Administrative control center for ProWork platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <div className="flex">
          <aside className="w-64 bg-gray-900 min-h-screen fixed left-0 top-0">
            <div className="p-4">
              <h1 className="text-xl font-bold text-white">ProWork Admin</h1>
            </div>
            <nav className="mt-8">
              <a href="/" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Dashboard</a>
              <a href="/workers" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Workers</a>
              <a href="/pods" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Pods</a>
              <a href="/tenants" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Tenants</a>
              <a href="/scheduler" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Scheduler</a>
              <a href="/evidence" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Evidence</a>
              <a href="/governance" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Governance</a>
              <a href="/principals" className="flex items-center px-4 py-3 text-gray-300 hover:bg-gray-800 hover:text-white">Principals</a>
            </nav>
          </aside>
          <main className="ml-64 flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  )
}
