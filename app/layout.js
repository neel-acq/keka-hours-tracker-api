export const metadata = {
  title: 'Keka Hours Tracker API',
  description: 'Backend API for Keka Hours Tracker extension'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
