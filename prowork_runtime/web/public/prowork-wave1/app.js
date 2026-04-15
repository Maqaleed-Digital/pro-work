(function(){
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll("[data-nav]").forEach(el => {
    if (el.getAttribute("href") === path) el.classList.add("active");
  });

  document.querySelectorAll("[data-fill-date]").forEach(el => {
    const d = new Date();
    el.textContent = d.toLocaleString();
  });

  document.querySelectorAll("[data-demo-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const msg = btn.getAttribute("data-demo-action");
      const target = document.getElementById("demo-status");
      if (target) {
        target.textContent = "Demo action executed: " + msg;
      } else {
        alert("Demo action executed: " + msg);
      }
    });
  });

  const onboardingForm = document.getElementById("onboarding-form");
  if (onboardingForm) {
    onboardingForm.addEventListener("submit", function(e){
      e.preventDefault();
      const status = document.getElementById("onboarding-status");
      status.textContent = "Tenant onboarding demo submitted successfully. Validation pack, provisioning request, and kickoff playbook queued.";
    });
  }
})();
