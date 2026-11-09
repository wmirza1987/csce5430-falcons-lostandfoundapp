import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
import Listings from "./pages/Listings";
import ListingDetail from "./pages/ListingDetail";
import Notifications from "./pages/Notifications";
import CreateListing from "./pages/CreateListing";
import EditListing from "./pages/EditListing";
import ClaimForm from "./pages/ClaimForm";
import ClaimReview from "./pages/ClaimReview";
import Messaging from "./pages/Messaging";
import MessageThreads from "./pages/MessageThreads";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <main className="page-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/listings" element={<Listings />} />

          <Route path="/listings/:id" element={<ListingDetail />} />

          <Route
            path="/listings/new"
            element={
              <ProtectedRoute>
                <CreateListing />
              </ProtectedRoute>
            }
          />

          <Route
            path="/listings/:id/edit"
            element={
              <ProtectedRoute>
                <EditListing />
              </ProtectedRoute>
            }
          />

          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />

          <Route
            path="/matches/:matchId/claim"
            element={
              <ProtectedRoute>
                <ClaimForm />
              </ProtectedRoute>
            }
          />

          <Route
            path="/claims/:id"
            element={
              <ProtectedRoute>
                <ClaimReview />
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <MessageThreads />
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages/:claimId"
            element={
              <ProtectedRoute>
                <Messaging />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
