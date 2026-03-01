import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClass } from '../context/ClassContext';

function ClassRequiredRoute() {
    const { user, loading: authLoading } = useAuth();
    const { currentClass, loading: classLoading } = useClass();

    if (authLoading || classLoading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!currentClass) {
        return <Navigate to="/select-class" replace />;
    }

    return <Outlet />;
}

export default ClassRequiredRoute;
