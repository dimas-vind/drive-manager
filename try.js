const axios = require("axios");
const { Init } = require("./auth/auth");
const { getFolderID, lsFileFromFolder } = require("./lib/read.drive");
const { uploadImageFromUrl } = require("./lib/write.drive");
const { writeToFile, sliceObject } = require("./lib/library");
const { db } = require("./lib/db_services/library");

(async () => {
  // await new Init().getNewAuth();
  // const parent = "APLIKASI CLASS ROOM";
  // writeToFile(__dirname + "/worker/auth.json", auth);

  // const url =
  //   "https://class.freshconsultant.co.id/img/fresh/absensi/Aris-Cahyono_16048372_2025-02-21_1_2.jpeg";
  // const date = url.split("_").slice(-3)[0];
  // const dir = {
  //   sub1: date.split("-")[0],
  //   sub2: date.split("-")[1],
  // };
  // const folderId = await getFolderID("artur", {
  //   createNew: true,
  // });

  // const data = await uploadImageFromUrl({ url, folderId, progress: true });

  // console.log({ folderId: folderId?.data?.files?.[0]?.id });

  const cekFile = await db(
    'SELECT Z, ID FROM DataAbsensi WHERE ID LIKE "%https://nc.freshconsultant%";'
  );

  await Promise.all(
    cekFile.map(async (item) => {
      const { selected, sliced } = sliceObject(item, ["Z"]);

      const sql = `UPDATE DataAbsensi SET ? WHERE Z = ${selected.Z};`;

      return await db(sql, {
        ID: `https://class.freshconsultant.co.id/img/fresh/absensi/${
          sliced.ID.split("/").slice(-1)[0]
        }`,
      });
    })
  );

  return console.log(cekFile);

  const listFile = await lsFileFromFolder("root");
  const imageFile = listFile.data.files.filter(
    (item) => item.mimeType === "image/jpeg"
  );

  const fromDB = await Promise.all(
    imageFile.map(async (item) => {
      const result = await db(
        `SELECT Z, LinkLokal FROM DataAbsensi WHERE ID = "${item.id}"`
      );
      const data = result[0];

      return {
        ...item,
        ...data,
      };
    })
  );

  const updateToDB = await Promise.all(
    fromDB.map(async (item) => {
      const { selected, sliced } = sliceObject(item, ["Z"]);
      const sql = `UPDATE DataAbsensi SET ? WHERE Z = ${selected.Z};`;

      return await db(sql, { ID: sliced.LinkLokal, LinkLokal: "" });
    })
  );

  console.log({ cek: updateToDB.map((item) => item?.affectedRows) });
})();
