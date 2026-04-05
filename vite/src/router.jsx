import { useState,useEffect } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import Login from './sections/login/Login'
import Tables from './sections/tables/Tables';
import Layout from './Layout';

const isAuthenticated = () => {
  
  return !!Cookies.get('aKaUser'); 
};

const LayoutWrapper = () => {

 // const { authData, authReady } = useContext(AuthContext);

  let user = 'admin'
 /*if(authData.aKaUser ) {
    user = authData.aKaUser
  }else if(Cookies.get('aKaUser')){
    user = Cookies.get('aKaUser')
  }*/

  return user ? <Layout /> : <Navigate to="/login" replace />;

};


const router = createHashRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: <LayoutWrapper />, 
    children: [
      {
        path: '/tables',
        element: <Tables />,
      }
    ]
  },
]);

export default router;
