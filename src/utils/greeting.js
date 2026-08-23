export const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Rise and shine";
  if (hour < 17) return "Hope your day's going well";
  if (hour < 21) return "Evening";
  return "Winding down for the night";
};