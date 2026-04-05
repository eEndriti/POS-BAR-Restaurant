import React, { useState } from "react";

// Mock users
const USERS = [
  { id: 1, name: "Endri" },
  { id: 2, name: "Ardit" },
  { id: 3, name: "Sara" },
];

// Clock Component
const Clock = () => {
  const [time, setTime] = useState(new Date());

  React.useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="fw-bold text-center" style={{ fontSize: "3rem" }}>
      {time.toLocaleTimeString()}
    </h1>
  );
};

// User Circle Button
const UserCircle = ({ user, onClick }) => (
  <div
    className="d-flex flex-column align-items-center m-3"
    style={{ cursor: "pointer" }}
    onClick={() => onClick(user)}
  >
    <div
      className="rounded-circle bg-dark text-white d-flex align-items-center justify-content-center"
      style={{ width: 80, height: 80, fontSize: 24 }}
    >
      {user.name.charAt(0)}
    </div>
    <small className="mt-2">{user.name}</small>
  </div>
);

// Password Input
const PasswordInput = ({ onSubmit }) => {
  const [password, setPassword] = useState("");

  return (
    <div className="d-flex align-items-center mt-4">
      <input
        type="password"
        className="form-control"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        className="btn btn-dark ms-2"
        onClick={() => onSubmit(password)}
      >
        →
      </button>
    </div>
  );
};

// Main Component
export default function POSLogin() {
  const [shiftStarted, setShiftStarted] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);

  const handleStartShift = (user, password) => {
    // simulate auth
    if (password.length > 0) {
      setActiveUsers([...activeUsers, user]);
      setShiftStarted(true);
      setSelectedUser(null);
    }
  };

  const handleLogin = (user, password) => {
    if (password.length > 0) {
      alert(`${user.name} logged in`);
      setSelectedUser(null);
    }
  };

  return (
    <div className="container-fluid vh-100 d-flex flex-column justify-content-between bg-white">
      {/* Top Clock */}
      <div className="pt-4">
        <Clock />
      </div>

      {/* Center Content */}
      <div className="d-flex flex-column align-items-center justify-content-center flex-grow-1">
        {!shiftStarted ? (
          <>
            <h4>Select User</h4>
            <div className="d-flex flex-wrap justify-content-center">
              {USERS.map((user) => (
                <UserCircle key={user.id} user={user} onClick={setSelectedUser} />
              ))}
            </div>

            {selectedUser && (
              <PasswordInput
                onSubmit={(pass) => handleStartShift(selectedUser, pass)}
              />
            )}
          </>
        ) : (
          <>
            <h4>Active Users</h4>
            <div className="d-flex flex-wrap justify-content-center">
              {activeUsers.map((user) => (
                <UserCircle key={user.id} user={user} onClick={setSelectedUser} />
              ))}
            </div>

            {selectedUser && (
              <PasswordInput
                onSubmit={(pass) => handleLogin(selectedUser, pass)}
              />
            )}
          </>
        )}
      </div>

      {/* Bottom Right Button */}
      {!shiftStarted && (
        <div className="position-absolute bottom-0 end-0 p-4">
          <button
            className="btn btn-dark btn-lg"
            onClick={() => setShiftStarted(false)}
          >
            Fillo Ndërrimin
          </button>
        </div>
      )}
    </div>
  );
}
