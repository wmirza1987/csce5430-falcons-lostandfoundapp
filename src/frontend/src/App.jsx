import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Listings from "./pages/Listings";
import CreateListing from "./pages/CreateListing";
import EditListing from "./pages/EditListing";

function App() {
  return (
    <BrowserRouter>
  <Navbar />

  <main className="page-container">
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/listings" element={<Listings />} />

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
    </Routes>
  </main>
</BrowserRouter>
  );
}

export default App;