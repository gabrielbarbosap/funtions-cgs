// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { createClient } = require("@supabase/supabase-js");
const { createCanvas, loadImage } = require("canvas");
const stream = require("stream");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");
const { Readable } = require("stream");
const { Parser } = require('json2csv');
const fs = require('fs');
const os = require('os');

const supabaseUrl = "https://dwxblapnnqbzkuscwvuy.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3eGJsYXBubnFiemt1c2N3dnV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODI1MTU1MTMsImV4cCI6MTk5ODA5MTUxM30.uM_mNNYvt_Jxupa60PrP4azIK8xj9u5slgBrJ2dYf30";
const supabase = createClient(supabaseUrl, supabaseKey);

initializeApp();

exports.obterCartela = onRequest(async (req, res) => {
  const { data, error } = await supabase
    .from(req.query.matriz)
    .select("*")
    .eq("reservado", false)
    .limit(req.query.qtd);

  if (error) {
    console.error("Error fetching data - error:", error);
    res.status(500).send("Error fetching data");
  } else {
    const updatePromises = data.map((element) => {
      return supabase
        .from(req.query.matriz)
        .update({ reservado: true, id_cliente: req.query.id_cliente })
        .eq("sequencial", element.sequencial);
    });

    try {
      const updateResults = await Promise.all(updatePromises);

      const updatedSequentials = [];
      updateResults.forEach((result, index) => {
        if (result.error) {
          console.error(
            `Error updating record with sequencial ${data[index].sequencial}:`,
            result.error
          );
        } else {
          updatedSequentials.push(data[index].sequencial);
        }
      });

      // Converte o array de sequenciais atualizados em uma string
      const updatedSequentialsString = updatedSequentials.join(", ");
      res.status(200).json({ sequenciais: updatedSequentialsString });
    } catch (updateError) {
      console.error("Error during the update process:", updateError);
      res.status(500).send("Error during the update process");
    }
  }
});

exports.obterVendidosFunc = onRequest(async (req, res) => {
  const { data, error } = await supabase
  .from("obtervendidos")
  .select("*")
  .eq("extracao", req.query.extracao);

if (error) {
  console.error("Error fetching data:", error);
  res.status(500).send("Error fetching data");
  return;
}

if (!data || data.length === 0) {
  res.status(404).send("No data found for the given extraction number");
  return;
}

try {
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(data);

  const csvFilePath = path.join(os.tmpdir(), `download-vendidos-${req.query.extracao}.csv`);
  fs.writeFileSync(csvFilePath, csv);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="download-vendidos-${req.query.extracao}.csv"`
  );
  res.setHeader("Content-Type", "text/csv");

  fs.createReadStream(csvFilePath).pipe(res).on('finish', () => {
    fs.unlinkSync(csvFilePath); // Remove the file after sending the response
  });

} catch (writeError) {
  console.error("Error writing CSV file:", writeError);
  res.status(500).send("Error writing CSV file");
}
});

exports.atualizarVendidos = onRequest(async (req, res) => {
  const { data, error } = await supabase
    .from("vendidos")
    .update({
      id_cliente: req.query.id_cliente,
      titulos: req.query.titulos,
      qtd_cartelas: req.query.qtd_cartelas,
      vlr_unitario: req.query.valor_cartela,
      id_sorteio: req.query.id_sorteio,
    })
    .eq("movId", req.query.movId);

  if (error) {
    console.error("Error updating record:", error);
    res.status(500).send("Error updating record");
  } else {
    res.status(200).json({
      data: `Record with movId ${req.query.movId} updated successfully`,
    });
  }
});

exports.capturarVendidos = onRequest(async (req, res) => {
  const sequenciais = req.query.sequenciais.split(",").map(Number);

  try {
    const { data: allCartelas, error: fetchError } = await supabase
      .from(req.query.matriz)
      .select("*")
      .eq("id_cliente", req.query.id_cliente);

    if (fetchError) {
      console.error("Error fetching data:", fetchError);
      res.status(500).send("Error fetching data");
      return;
    }

    const filteredCartelas = allCartelas.filter((cartela) =>
      sequenciais.includes(cartela.sequencial)
    );

    if (filteredCartelas.length === 0) {
      res.status(404).send("No cartelas found for the provided sequenciais.");
      return;
    }

    const templateImage = await loadImage(
      "https://dwxblapnnqbzkuscwvuy.supabase.co/storage/v1/object/public/principal/img/T_tulo.png"
    );

    const canvasWidth = templateImage.width;
    const canvasHeight = templateImage.height * filteredCartelas.length;
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const context = canvas.getContext("2d");

    let yPosition = 10;

    filteredCartelas.forEach((cartela, index) => {
      const dezenas = cartela.dezenas.trim().split(" ");

      context.drawImage(templateImage, 0, yPosition);

      //cria sequencial
      context.font = "bold 60px Arial";
      context.fillStyle = "black";
      context.textAlign = "center";
      context.fillText(`Título:  ${cartela.sequencial}`, 200, yPosition + 150);

      //cria data
      context.font = "bold 60px Arial";
      context.fillStyle = "black";
      context.textAlign = "center";
      context.fillText(
        `Data:  ${req.query.data_sorteio}`,
        300,
        yPosition + 280
      );

      //cria extracao
      context.font = "bold 20px Arial";
      context.fillStyle = "black";
      context.textAlign = "center";
      context.fillText(
        `Extração:  ${req.query.extracao}`,
        150,
        yPosition + 1900
      );

      //cria código
      context.font = "bold 20px Arial";
      context.fillStyle = "black";
      context.textAlign = "center";
      context.fillText(
        `Identificador:  ${req.query.movId}`,
        300,
        yPosition + 1950
      );

      const circleRadius = 50; // Ajuste conforme necessário
      const circleCenters = [
        { x: 153, y: 710 },
        { x: 428, y: 710 },
        { x: 708, y: 710 },
        { x: 978, y: 710 },
        { x: 1248, y: 710 },
        ////
        { x: 153, y: 1000 },
        { x: 428, y: 1000 },
        { x: 708, y: 1000 },
        { x: 978, y: 1000 },
        { x: 1248, y: 1000 },
        //
        { x: 153, y: 1290 },
        { x: 428, y: 1290 },
        { x: 708, y: 1290 },
        { x: 978, y: 1290 },
        { x: 1248, y: 1290 },
        //
        { x: 153, y: 1575 },
        { x: 428, y: 1575 },
        { x: 708, y: 1575 },
        { x: 978, y: 1575 },
        { x: 1248, y: 1575 },
      ];

      context.fillStyle = "black";
      context.font = "bold 140px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";

      dezenas.forEach((dezena, i) => {
        if (i < circleCenters.length) {
          const { x, y } = circleCenters[i];
          context.fillText(dezena, x, yPosition + y);
        }
      });

      yPosition += templateImage.height;
    });

    res.setHeader("Content-Type", "image/png");
    const imageStream = canvas.createPNGStream();
    imageStream.pipe(res);
  } catch (error) {
    console.error("Error during the process:", error);
    res.status(500).send(`Error during the process: ${error.message}`);
  }
});

//firebase deploy --only functions
//firebase emulators:start
