import { toast } from 'react-toastify' 
   
// Initialize toast notification
const notify = (message, type = 'success') => {
 if (type === 'error') {
   toast.error(message);
 } else {
   toast.success(message);
 }
};

export default notify;
