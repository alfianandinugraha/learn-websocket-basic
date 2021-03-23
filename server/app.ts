import WebSocket from "ws";
import lowdb from "lowdb";
import FileSync from "lowdb/adapters/FileSync";

interface Message {
  id: number;
  body: string;
}

interface Database {
  messages: Message[];
}

type StateTypes =
  | "SEND_MESSAGE"
  | "DELETE_MESSAGE"
  | "ERROR_SEND_MESSAGE"
  | "SUCCESS_SEND_MESSAGE"
  | "SUCCESS_GET_MESSAGES"
  | "SOMEONE_TYPING"
  | "SOMEONE_LEAVE_TYPING";

interface State<T> {
  type: StateTypes;
  payload: T;
}

const WebSocketServer = new WebSocket.Server({ port: 8081 });

const adapter = new FileSync<Database>("db.json");
const db = lowdb(adapter);

db.defaults({ messages: [] }).write();

const broadcastSocket = (payload: any) => {
  WebSocketServer.clients.forEach((client) => {
    client.readyState === WebSocket.OPEN && client.send(payload);
  });
};

const broadcastSocketExclude = (payload: any, socket: WebSocket) => {
  WebSocketServer.clients.forEach((client) => {
    socket !== client &&
      client.readyState === WebSocket.OPEN &&
      client.send(payload);
  });
};

const socketPayloadFactory = (type: StateTypes, payload?: any) =>
  JSON.stringify({ type, payload: payload });

const broadcastListMessage = () =>
  broadcastSocket(
    socketPayloadFactory("SUCCESS_GET_MESSAGES", db.get("messages").value())
  );

WebSocketServer.on("connection", (socket) => {
  socket.send(
    socketPayloadFactory("SUCCESS_GET_MESSAGES", db.get("messages").value())
  );

  socket.on("message", (payload: string) => {
    let state: State<any> = JSON.parse(payload);

    switch (state.type) {
      case "SEND_MESSAGE":
        if (!state.payload.body) {
          socket.send(socketPayloadFactory("ERROR_SEND_MESSAGE"));
          break;
        }
        db.get("messages").push(state.payload).write();
        broadcastListMessage();
        break;
      case "DELETE_MESSAGE":
        db.get("messages").remove({ id: state.payload.id }).write();
        broadcastListMessage();
        break;
      case "SOMEONE_TYPING":
        broadcastSocketExclude(socketPayloadFactory("SOMEONE_TYPING"), socket);
        break;
      case "SOMEONE_LEAVE_TYPING":
        broadcastSocketExclude(
          socketPayloadFactory("SOMEONE_LEAVE_TYPING"),
          socket
        );
        break;
    }
  });
});
