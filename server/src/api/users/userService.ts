import * as userModel from "./userModel.js";


async function getUserById(id: number) {
  return userModel.getUserById(id);
}

export default {
    getUserById,
}