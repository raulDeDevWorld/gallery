
import { UserProvider } from '@/context'
import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="es" data-theme="neutral" data-accent="cyan">
      <head>
        <link rel="icon" href="/favicon.png" />
        <link rel='manifest' href='/manifest.json' />
        <link rel='apple-touch-icon' href='/favicon.png' /> 
        <meta name="theme-color" content="#000000" />
        <meta name="msapplication-navbutton-color" content="#000000" />
        <meta name="apple-mobile-web-app-status-bar-style" content="#000000" />
        <meta name="description" content="Sistema de Administracion Gallery Sneakers" />
        <meta name="keywords" content="Velox" />
        <meta name="author" content="Velox" />
        <title>Gallery Sneakers</title>
      </head>
      <body className="bg-bg text-text">
        <UserProvider>
          <main className='min-h-screen bg-bg text-text'>
            {children}
          </main>
        </UserProvider>
      </body>
    </html>
  )
}
