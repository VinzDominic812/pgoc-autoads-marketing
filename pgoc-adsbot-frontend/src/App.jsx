import RouterComponent from "./Router";
import { HashRouter as Router } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import { AdSpendAutoRefreshProvider } from "./contexts/AdSpendAutoRefreshContext";

const apiUrl = import.meta.env.VITE_API_URL;

function App() {
  return (
    <div>
      <AdSpendAutoRefreshProvider apiUrl={apiUrl}>
        <Router>
          <ToastContainer
            position="top-center"
            autoClose={1500}
            pauseOnFocusLoss={false}
            pauseOnHover={false}
          />
          <RouterComponent /> {/* Use the Router component here */}
        </Router>
      </AdSpendAutoRefreshProvider>
    </div>
  );
}

export default App;
