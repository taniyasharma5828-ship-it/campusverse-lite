package com.campusverse;
import com.campusverse.util.*;
import com.campusverse.model.*;
import com.campusverse.servlet.MessageApiServlet;
import com.campusverse.service.GhostRoomService;
import com.campusverse.dao.RoomDAO;
import jakarta.servlet.http.*;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Proxy;
import java.io.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class SecurityRegressionTest {
    @Test void filterRejectsMissingAndWrongCsrfAndAllowsCorrectToken() throws Exception {
        for(String supplied : new String[]{null,"wrong","valid"}) {
            Map<String,Object> attrs=new HashMap<>();
            attrs.put("csrfToken","valid"); attrs.put("currentStudent",new Student());
            HttpSession session=(HttpSession)Proxy.newProxyInstance(HttpSession.class.getClassLoader(),new Class[]{HttpSession.class},(p,m,a)->m.getName().equals("getAttribute")?attrs.get(a[0]):null);
            HttpServletRequest req=(HttpServletRequest)Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),new Class[]{HttpServletRequest.class},(p,m,a)->switch(m.getName()) {
                case "getSession" -> session;
                case "getMethod" -> "POST";
                case "getServletPath" -> "/messages";
                case "getHeader" -> a[0].equals("Accept")?"application/json":a[0].equals("X-CSRF-Token")?supplied:null;
                default -> null;
            });
            int[] status={200}; boolean[] called={false};
            HttpServletResponse res=(HttpServletResponse)Proxy.newProxyInstance(HttpServletResponse.class.getClassLoader(),new Class[]{HttpServletResponse.class},(p,m,a)-> {
                if(m.getName().equals("setStatus"))status[0]=(int)a[0];
                if(m.getName().equals("getWriter"))return new PrintWriter(new StringWriter());return null;
            });
            new SecurityFilter().doFilter(req,res,(a,b)->called[0]=true);
            assertEquals("valid".equals(supplied),called[0]);assertEquals("valid".equals(supplied)?200:403,status[0]);
        }
    }
    @Test void messageApiRejectsLoggedOutRequest() throws Exception {
        HttpServletRequest req=(HttpServletRequest)Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),new Class[]{HttpServletRequest.class},(p,m,a)->m.getName().equals("getMethod")?"GET":null);
        int[] status={0};StringWriter text=new StringWriter();
        HttpServletResponse res=(HttpServletResponse)Proxy.newProxyInstance(HttpServletResponse.class.getClassLoader(),new Class[]{HttpServletResponse.class},(p,m,a)->{
            if(m.getName().equals("setStatus"))status[0]=(int)a[0];if(m.getName().equals("getWriter"))return new PrintWriter(text);return null;
        });
        new MessageApiServlet().service(req,res);assertEquals(401,status[0]);assertTrue(text.toString().contains("error"));
    }
    @Test void twoHoursMeansTwoHoursAndDeadlineIsClosed() throws Exception {
        Instant now=Instant.parse("2026-01-01T00:00:00Z");
        RoomDAO dao=new RoomDAO(){@Override public Room createRoom(Room room){return room;}};
        Room room=new GhostRoomService(dao,Clock.fixed(now,ZoneOffset.UTC)).createGhostRoom("Revision","2 hours");
        assertEquals(now.plusSeconds(7200),room.getExpiresAt().toInstant());
        assertTrue(room.isExpired(Clock.fixed(now.plusSeconds(7200),ZoneOffset.UTC)));
    }
    @Test void scriptJsonCannotCloseHtmlScriptElement() {
        String escaped=SecurityUtils.escapeScriptJson("</script><script>alert(1)</script>");
        assertFalse(escaped.contains("<"));assertTrue(escaped.contains("\\u003c"));
    }
}
