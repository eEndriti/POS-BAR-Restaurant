import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import router from './router.jsx'
import './assets/bootstrap.min.css'
import 'react-toastify/dist/ReactToastify.css';
import { ToastProvider } from "./ToastProvider";




ReactDOM.createRoot(document.getElementById('root')).render(
        <ToastProvider>
            <RouterProvider router={router} />
        </ToastProvider>   
)