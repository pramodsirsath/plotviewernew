import { BrowserRouter, Routes, Route } from "react-router-dom";
import UploadLayout from "./components/Admin/UploadLayout";
import AutoPlotEditor from "./components/Admin/AutoPlotEditor";
import Editor3D from "./components/Admin/Editor3D";
import MapOverlayEditorPage from "./components/Admin/MapOverlayEditorPageStable";
import PublicLayoutView from "./components/Customer/PublicLayoutView";
import AdminDashboard from "./components/Admin/AdminDashboard";
import Signup from "./components/auth/Signup";
import Login from "./components/auth/Login";
import RoleRoute from "./components/auth/RoleRoute";
import BuilderDashboard from "./components/Builder/BuilderDashboard";
import CustomerLayout from "./components/Customer/CustomerLayout";
import BuilderLayoutView from "./components/Builder/BuilderLayoutView";


function App() {
  return (
    <BrowserRouter>

      <Routes>
        {/* Public */}
        <Route path="/" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/layout/view/:token" element={<PublicLayoutView />} />

        {/* Admin Dashboard */}
        <Route
          path="/admin-dashboard"
          element={
            <RoleRoute allowedRole="admin">
              <AdminDashboard />
            </RoleRoute>
          }
        />

        {/* Builder/Staff Dashboard */}
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

        {/* Admin Only Routes */}
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
    </BrowserRouter>
  );
}

export default App;
