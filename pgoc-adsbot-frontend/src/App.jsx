import RouterComponent from "./Router";
import { HashRouter as Router } from "react-router-dom";
import { ToastContainer } from 'react-toastify';

function App() {
  return (
    <div>
      <Router>
        <ToastContainer
          position="top-center"
          autoClose={1500}
          pauseOnFocusLoss={false}
          pauseOnHover={false}
        />
        <RouterComponent /> {/* Use the Router component here */}
      </Router>
    </div>
  );
}

export default App;
