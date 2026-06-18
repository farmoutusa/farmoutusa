import React from 'react';
import PhoneChecker from './components/PhoneChecker.jsx';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-700 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold leading-tight">Callback Window Checker</h1>
          <p className="text-blue-300 text-xs">Is it OK to call this customer right now?</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-3">
        <PhoneChecker />
      </main>
    </div>
  );
}
