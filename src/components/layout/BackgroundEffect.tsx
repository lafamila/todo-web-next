"use client";

import React from "react";

const BackgroundEffect = () => {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      {/* Background Grid Effect */}
      {/* <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div> */}

      {/* Glowing Orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-[#3994ef] rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>
    </div>
  );
};

export default BackgroundEffect;
