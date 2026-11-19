package com.campusverse.util;

import jakarta.servlet.*;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@WebFilter(filterName = "SecurityFilter", urlPatterns = {"/*"})
public class SecurityFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        request.setCharacterEncoding("UTF-8");
        response.setCharacterEncoding("UTF-8");
        if (request instanceof HttpServletRequest req && response instanceof HttpServletResponse res) {
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("X-Frame-Options", "DENY");
            boolean json = req.getServletPath().startsWith("/api/") || "true".equalsIgnoreCase(req.getParameter("json"))
                || (req.getHeader("Accept") != null && req.getHeader("Accept").contains("application/json"));
            String path = req.getServletPath();
            boolean asset = path.startsWith("/css/") || path.startsWith("/js/");
            HttpSession session = req.getSession(!asset);
            if (session != null && session.getAttribute("csrfToken") == null)
                session.setAttribute("csrfToken", UUID.randomUUID().toString());
            if (!asset) res.setHeader("Cache-Control", "no-store");
            if (session != null) res.setHeader("X-CSRF-Token", (String) session.getAttribute("csrfToken"));
            boolean unsafe = !java.util.Set.of("GET", "HEAD", "OPTIONS").contains(req.getMethod());
            boolean login = path.equals("/student") && unsafe &&
                (req.getParameter("action") == null || java.util.Set.of("login", "saveProfile").contains(req.getParameter("action")));
            boolean publicPath = asset || path.isEmpty() || path.equals("/") || path.equals("/home") || path.equals("/student");
            if ((!publicPath || (unsafe && !login)) && (session == null || session.getAttribute("currentStudent") == null)) {
                reject(res, 401, "Enter a nickname first", json); return;
            }
            if (unsafe) {
                String supplied = req.getHeader("X-CSRF-Token");
                if (supplied == null) supplied = req.getParameter("csrfToken");
                String expected = session == null ? null : (String) session.getAttribute("csrfToken");
                if (expected == null || supplied == null || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8))) {
                    reject(res, 403, "Invalid CSRF token. Reload the page and try again.", json); return;
                }
            }
        }
        chain.doFilter(request, response);
    }
    private void reject(HttpServletResponse res, int status, String message, boolean json) throws IOException {
        if (json) {
            res.setStatus(status); res.setContentType("application/json;charset=UTF-8");
            res.getWriter().write("{\"error\":\"" + SecurityUtils.escapeJson(message) + "\"}");
        } else res.sendError(status, message);
    }
}
