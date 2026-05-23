import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import RoleRoute from "./components/auth/RoleRoute";

const UploadLayout = lazy(() => import("./components/Admin/UploadLayout"));
const AutoPlotEditor = lazy(() => import("./components/Admin/AutoPlotEditor"));
const Editor3D = lazy(() => import("./components/Admin/Editor3D"));
const MapOverlayEditorPage = lazy(() => import("./components/Admin/MapOverlayEditorPage"));
const PublicLayoutView = lazy(() => import("./components/Customer/PublicLayoutView"));
const AdminDashboard = lazy(() => import("./components/Admin/AdminDashboard"));
const Signup = lazy(() => import("./components/auth/Signup"));
const Login = lazy(() => import("./components/auth/Login"));
const BuilderDashboard = lazy(() => import("./components/Builder/BuilderDashboard"));
const CustomerLayout = lazy(() => import("./components/Customer/CustomerLayout"));
const BuilderLayoutView = lazy(() => import("./components/Builder/BuilderLayoutView"));

const RouteFallback = () => (
  <div style={{
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#171717",
    color: "#f8fafc",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 800,
  }}>
    Loading...
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/layout/view/:token" element={<PublicLayoutView />} />

          <Route
            path="/admin-dashboard"
            element={
              <RoleRoute allowedRole="admin">
                <AdminDashboard />
              </RoleRoute>
            }
          />

          <Route
            path="/builder-dashboard"
            element={
              <RoleRoute allowedRoles={["builder", "staff"]}>
                <BuilderDashboard />
              </RoleRoute>
            }
          />
          <Route
            path="/builder/layout/:id"
            element={
              <RoleRoute allowedRoles={["builder", "staff"]}>
                <BuilderLayoutView />
              </RoleRoute>
            }
          />

          <Route
            path="/uploadimage"
            element={
              <RoleRoute allowedRole="admin">
                <UploadLayout />
              </RoleRoute>
            }
          />
          <Route
            path="/editor"
            element={
              <RoleRoute allowedRole="admin">
                <AutoPlotEditor />
              </RoleRoute>
            }
          />
          <Route
            path="/layout/:id/3d-editor"
            element={
              <RoleRoute allowedRole="admin">
                <Editor3D />
              </RoleRoute>
            }
          />
          <Route
            path="/layout/:id/map-editor"
            element={
              <RoleRoute allowedRole="admin">
                <MapOverlayEditorPage />
              </RoleRoute>
            }
          />
          <Route
            path="/layout/:id/edit"
            element={
              <RoleRoute allowedRole="admin">
                <AutoPlotEditor />
              </RoleRoute>
            }
          />
          <Route
            path="/layout/:id"
            element={
              <RoleRoute allowedRole="admin">
                <CustomerLayout />
              </RoleRoute>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
