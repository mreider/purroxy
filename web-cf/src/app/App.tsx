import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Marketplace from './pages/Marketplace';
import MarketplaceDetail from './pages/MarketplaceDetail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Creator from './pages/Creator';
import DocsLayout from './pages/docs/DocsLayout';
import Overview from './pages/docs/Overview';
import WhatIsASite from './pages/docs/WhatIsASite';
import GettingStarted from './pages/docs/GettingStarted';
import Security from './pages/docs/Security';
import Publishing from './pages/docs/Publishing';
import Pricing from './pages/docs/Pricing';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/marketplace/:slug" element={<MarketplaceDetail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/creator" element={<Creator />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Overview />} />
          <Route path="what-is-a-site" element={<WhatIsASite />} />
          <Route path="getting-started" element={<GettingStarted />} />
          <Route path="security" element={<Security />} />
          <Route path="publishing" element={<Publishing />} />
          <Route path="pricing" element={<Pricing />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
