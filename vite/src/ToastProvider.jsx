// ToastProvider.jsx
import React, { createContext, useContext } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

const TOAST_CONTAINER_ID = "global-toast-container";

export const ToastProvider = ({ children }) => {

  const showToast = (message = '', type = "info") => {
    toast(message, {
      autoClose: 2000,
      type: type,
      containerId: TOAST_CONTAINER_ID,
    });
  };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <ToastContainer containerId={TOAST_CONTAINER_ID} />
    </ToastContext.Provider>
  );
};
